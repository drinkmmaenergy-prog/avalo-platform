/**
 * PACK 237: Breakup Recovery & Restart Path - Type Definitions
 * 
 * A graceful ending system when couples stop interacting, protecting emotions,
 * reputation, and platform safety while gently re-opening paths to new connections.
 * 
 * KEY DIFFERENCES FROM PACK 222:
 * - Triggered ONLY by mutual choice, not timeout
 * - 3-7 day recovery period (self-adjusting)
 * - Explicit feature blocking during recovery
 * - Ordered restart path (Discovery → Swipe → Chat → Events)
 * - Clean ending with pre-set closing notes (no open text)
 */

import type { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// BREAKUP RECOVERY STATE
// ============================================================================

export type BreakupRecoveryStatus = 'active' | 'inactive' | 'cooldown';

export type BreakupTriggerReason = 
  | 'mutual'           // Both users chose "End Connection"
  | 'blocked'          // One user blocked the other
  | 'safety'           // Safety incident flagged
  | 'timeout';         // "Take a break" by both with cooldown

export type RestartStage = 0 | 1 | 2 | 3 | 4;
// 0 = Initial recovery (all blocked)
// 1 = Discovery feed unlocked (day 3)
// 2 = Swipe queue unlocked
// 3 = Paid chat unlocked
// 4 = Events & calendar unlocked (full restart)

export interface BreakupRecoveryState {
  // Core identifiers
  recoveryId: string;
  userId: string;
  partnerId: string;
  connectionId: string; // The chat/connection that ended
  
  // Status tracking
  status: BreakupRecoveryStatus;
  reason: BreakupTriggerReason;
  
  // Timeline tracking
  startDate: Timestamp;
  endDate: Timestamp;
  expectedDuration: number; // in days (3-7)
  
  // Restart progression (0-4)
  restartStage: RestartStage;
  stageUnlockedAt?: {
    stage1?: Timestamp; // Discovery feed
    stage2?: Timestamp; // Swipe queue
    stage3?: Timestamp; // Paid chat
    stage4?: Timestamp; // Events & calendar
  };
  
  // Feature blocking status
  featuresBlocked: {
    paidChat: boolean;
    calls: boolean;
    meetups: boolean;
    discoveryFeed: boolean;
    swipeQueue: boolean;
    events: boolean; // Events with non-friends
    calendar: boolean;
  };
  
  // Emotional signals for duration adjustment
  emotionalSignals: {
    activityLevel: 'very_low' | 'low' | 'medium' | 'high';
    lastActiveAt?: Timestamp;
    recoveryFeedEngagement: number; // 0-100
    affirmationsViewed: number;
    profileImprovementsViewed: number;
  };
  
  // Safety overrides
  safetyOverride: boolean;
  safetyIncidentId?: string;
  permanentBlock: boolean;
  
  // Closing note chosen (for clean ending)
  closingNote?: 'thank_you' | 'good_wishes' | 'closing_chapter';
  
  // Completion tracking
  completedAt?: Timestamp;
  restartedDiscovery: boolean;
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// CLEAN ENDING FLOW
// ============================================================================

export interface EndConnectionRequest {
  requestId: string;
  connectionId: string;
  initiatorId: string;
  respondentId: string;
  closingNote: 'thank_you' | 'good_wishes' | 'closing_chapter';
  
  // Status tracking
  status: 'pending_confirmation' | 'confirmed' | 'declined' | 'expired';
  confirmedAt?: Timestamp;
  declinedAt?: Timestamp;
  expiresAt: Timestamp;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EndedConnection {
  connectionId: string;
  user1Id: string;
  user2Id: string;
  
  // Ending details
  endedAt: Timestamp;
  endedBy: 'mutual' | 'block' | 'safety' | 'timeout';
  
  // Closing notes from each user
  user1ClosingNote?: 'thank_you' | 'good_wishes' | 'closing_chapter';
  user2ClosingNote?: 'thank_you' | 'good_wishes' | 'closing_chapter';
  
  // Archives
  chatLocked: boolean;
  trophyCabinetArchived: boolean;
  memoryLogViewOnly: boolean;
  profileVisibilityChoice: 'visible' | 'hidden'; // User choice
  
  createdAt: Timestamp;
}

// ============================================================================
// RECOVERY FEED
// ============================================================================

export type RecoveryFeedItemType = 
  | 'affirmation'           // Uplifting AI-generated affirmations
  | 'self_esteem_booster'   // Self-esteem boosting messages
  | 'profile_suggestion'    // Profile glow-up suggestions
  | 'milestone'             // Recovery progress milestones
  | 'restart_prompt';       // Gentle prompts to return to discovery

export interface RecoveryFeedItem {
  itemId: string;
  userId: string;
  recoveryId: string;
  
  type: RecoveryFeedItemType;
  
  // Content
  title: string;
  message: string;
  icon?: string;
  imageUrl?: string;
  
  // Action (optional)
  actionLabel?: string;
  actionType?: 'boost_profile' | 'polish_bio' | 'choose_traits' | 'view_discovery';
  actionPrice?: number; // in tokens, if monetized
  
  // Interaction tracking
  viewedAt?: Timestamp;
  interactedAt?: Timestamp;
  dismissedAt?: Timestamp;
  actionTaken?: boolean;
  
  // Scheduling
  scheduledFor?: Timestamp;
  
  createdAt: Timestamp;
}

// ============================================================================
// RESTART PATH MONETIZATION
// ============================================================================

export interface RestartPathOffer {
  offerId: string;
  userId: string;
  recoveryId: string;
  
  // Offer details
  type: 'boost_visibility' | 'polish_profile' | 'choose_traits';
  title: string;
  description: string;
  price: number; // in tokens
  
  // Availability
  availableAt: RestartStage; // Which stage this offer appears at
  expiresAt?: Timestamp;
  
  // Interaction tracking
  shownAt?: Timestamp;
  purchasedAt?: Timestamp;
  declinedAt?: Timestamp;
  
  createdAt: Timestamp;
}

// ============================================================================
// SAFETY INCIDENTS
// ============================================================================

export interface BreakupSafetyIncident {
  incidentId: string;
  userId: string;
  partnerId: string;
  connectionId: string;
  
  // Incident details
  type: 'harassment' | 'stalking' | 'abuse' | 'under_18' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  
  // Actions taken
  immediateBreakup: boolean;
  permanentBlock: boolean;
  accountAudit: boolean;
  forcedInvisibility: boolean;
  monitoredRestart: boolean;
  
  // Status
  status: 'active' | 'investigating' | 'resolved' | 'escalated';
  resolvedAt?: Timestamp;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// ANALYTICS & TRACKING
// ============================================================================

export interface BreakupRecoveryAnalytics {
  analyticsId: string;
  userId: string;
  recoveryId: string;
  
  // Recovery metrics
  totalDuration: number; // in days
  stageProgression: {
    stage0Duration: number; // days
    stage1Duration: number;
    stage2Duration: number;
    stage3Duration: number;
    stage4Duration: number;
  };
  
  // Engagement metrics
  recoveryFeedViews: number;
  affirmationsViewed: number;
  suggestionsViewed: number;
  actionsTaken: number;
  tokensSpent: number;
  
  // Restart metrics
  restartedSuccessfully: boolean;
  timeToRestart: number; // in hours
  firstActionAfterRestart?: 'swipe' | 'chat' | 'event' | 'profile_view';
  
  // Outcomes
  returnedToActive: boolean;
  churnedAfterRecovery: boolean;
  
  createdAt: Timestamp;
  completedAt?: Timestamp;
}

// ============================================================================
// HELPER TYPES
// ============================================================================

export interface ClosingNoteMessage {
  code: 'thank_you' | 'good_wishes' | 'closing_chapter';
  message: string;
}

export const CLOSING_NOTE_MESSAGES: ClosingNoteMessage[] = [
  {
    code: 'thank_you',
    message: 'Thank you for the time we spent.'
  },
  {
    code: 'good_wishes',
    message: 'Wishing you good things in life.'
  },
  {
    code: 'closing_chapter',
    message: 'Closing this chapter.'
  }
];

export interface RecoveryStageUnlock {
  stage: RestartStage;
  label: string;
  description: string;
  features: string[];
}

export const RECOVERY_STAGE_UNLOCKS: RecoveryStageUnlock[] = [
  {
    stage: 0,
    label: 'Recovery Mode',
    description: 'Taking time to rebuild',
    features: ['AI Companions', 'Events with friends only', 'Recovery Feed']
  },
  {
    stage: 1,
    label: 'Discovery Unlocked',
    description: 'Browse profiles again',
    features: ['Discovery feed', 'Profile browsing', 'Wishlist viewing']
  },
  {
    stage: 2,
    label: 'Swipe Queue Unlocked',
    description: 'Start making connections',
    features: ['Swipe queue', 'Like profiles', 'Send interests']
  },
  {
    stage: 3,
    label: 'Paid Chat Unlocked',
    description: 'Begin conversations',
    features: ['Paid chat', 'Voice calls', 'Video calls']
  },
  {
    stage: 4,
    label: 'Full Restart',
    description: 'Every ending creates space for something new',
    features: ['Events & calendar', 'Meetup scheduling', 'All features unlocked']
  }
];