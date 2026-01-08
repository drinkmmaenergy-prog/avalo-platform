/**
 * PACK 236 — Second Chance Mode
 * TypeScript types and interfaces for cold match revival system
 */

import { Timestamp } from 'firebase-admin/firestore';

/**
 * Reason why Second Chance was triggered
 */
export type SecondChanceReason = 
  | 'memory'              // Had Memory Log entry
  | 'highCompatibility'   // Strong swipe-compatibility score
  | 'pastMomentum'        // >50 paid words OR >1 call
  | 'meetingHistory'      // Booked meeting (successful or cancelled)
  | 'sentiment'           // High-value conversation (>400 paid words)
  | 'calendarHistory';    // Had calendar interaction

/**
 * Type of paid action suggested for reactivation
 */
export type SecondChanceActionType =
  | 'voiceNoteMemory'     // Send voice note (starts paid voice call)
  | 'videoCatchUp'        // Video call suggestion
  | 'deepQuestion'        // Paid chat message
  | 'bookMeetup'          // Calendar booking
  | 'memoryFrame'         // Microtransaction
  | 'digitalGift'         // Microtransaction
  | 'rewriteFirstMessage'; // Paid message rewrite

/**
 * Second Chance data structure stored in match document
 */
export interface SecondChanceData {
  /** Whether this match is eligible for Second Chance */
  eligible: boolean;
  
  /** Last time Second Chance was triggered */
  lastTriggered: Timestamp | null;
  
  /** Reason for eligibility */
  reason: SecondChanceReason | null;
  
  /** Number of times Second Chance has been triggered */
  triggerCount: number;
  
  /** Whether user acted on last trigger */
  lastActionTaken: boolean;
  
  /** Timestamp of last action (if any) */
  lastActionTimestamp: Timestamp | null;
}

/**
 * Match eligibility criteria
 */
export interface MatchEligibilityCriteria {
  /** Days since last interaction */
  daysSinceLastInteraction: number;
  
  /** Total paid words in conversation */
  totalPaidWords: number;
  
  /** Number of paid calls */
  callCount: number;
  
  /** Has Memory Log entry */
  hasMemoryLog: boolean;
  
  /** Has meeting history (booked or cancelled) */
  hasMeetingHistory: boolean;
  
  /** Swipe compatibility score (0-100) */
  compatibilityScore: number;
  
  /** Whether match has active safety flags */
  hasSafetyFlags: boolean;
  
  /** Whether Sleep Mode is active */
  sleepModeActive: boolean;
  
  /** Whether Breakup Recovery is active */
  breakupRecoveryActive: boolean;
  
  /** Whether either user blocked the other */
  isBlocked: boolean;
  
  /** Whether stalker risk is flagged */
  stalkerRisk: boolean;
  
  /** Age gap between users */
  ageGap: number;
  
  /** Maximum age gap allowed by user settings */
  maxAgeGap: number;
}

/**
 * Emotional message template
 */
export interface EmotionalMessageTemplate {
  /** Unique template ID */
  id: string;
  
  /** Template text with optional placeholders */
  text: string;
  
  /** Which reasons this template is appropriate for */
  applicableReasons: SecondChanceReason[];
  
  /** Suggested action to pair with this message */
  suggestedAction: SecondChanceActionType;
  
  /** Emotional tone (romantic, friendly, nostalgic, etc.) */
  tone: 'romantic' | 'friendly' | 'nostalgic' | 'curious' | 'playful';
  
  /** Priority (higher = more likely to be chosen) */
  priority: number;
}

/**
 * Second Chance notification payload
 */
export interface SecondChanceNotification {
  /** Match ID */
  matchId: string;
  
  /** User to send notification to */
  userId: string;
  
  /** Other user in the match */
  otherUserId: string;
  
  /** Emotional message */
  message: string;
  
  /** Suggested action */
  suggestedAction: SecondChanceActionType;
  
  /** Reason for trigger */
  reason: SecondChanceReason;
  
  /** Context data (e.g., memory log excerpt, topic discussed) */
  context?: {
    topicDiscussed?: string;
    lastCallDate?: Timestamp;
    meetingLocation?: string;
    sharedInterest?: string;
  };
}

/**
 * Second Chance action log entry
 */
export interface SecondChanceAction {
  /** Timestamp of action */
  timestamp: Timestamp;
  
  /** User who took action */
  userId: string;
  
  /** Type of action taken */
  actionType: SecondChanceActionType;
  
  /** Whether action was paid */
  paid: boolean;
  
  /** Amount charged (in tokens) */
  tokensCharged?: number;
  
  /** Whether action resulted in re-engagement */
  reengagementSuccess: boolean;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Second Chance statistics for a user
 */
export interface SecondChanceStats {
  /** Total Second Chance notifications received */
  totalReceived: number;
  
  /** Total actions taken */
  totalActionsTaken: number;
  
  /** Conversion rate (actions / received) */
  conversionRate: number;
  
  /** Total tokens spent via Second Chance */
  totalTokensSpent: number;
  
  /** Successful re-engagements */
  successfulReengagements: number;
  
  /** Date of last notification */
  lastNotification: Timestamp | null;
  
  /** Breakdown by reason */
  byReason: Record<SecondChanceReason, {
    received: number;
    actionsTaken: number;
    tokensSpent: number;
  }>;
}

/**
 * User settings for Second Chance
 */
export interface SecondChanceSettings {
  /** Whether user has enabled Second Chance notifications */
  enabled: boolean;
  
  /** Preferred notification time (24-hour format) */
  preferredTime?: number; // 0-23
  
  /** Maximum notifications per week */
  maxPerWeek?: number;
  
  /** Opt out of specific action types */
  disabledActions?: SecondChanceActionType[];
}

/**
 * Cloud Function execution context
 */
export interface SecondChanceScanContext {
  /** Scan start time */
  startTime: Timestamp;
  
  /** Total matches scanned */
  matchesScanned: number;
  
  /** Eligible matches found */
  eligibleMatches: number;
  
  /** Notifications sent */
  notificationsSent: number;
  
  /** Errors encountered */
  errors: number;
  
  /** Execution time (ms) */
  executionTime: number;
  
  /** Breakdown by reason */
  breakdownByReason: Record<SecondChanceReason, number>;
}

/**
 * Helper type for match document with Second Chance data
 */
export interface MatchWithSecondChance {
  id: string;
  userId1: string;
  userId2: string;
  lastInteraction: Timestamp;
  totalPaidWords: number;
  callCount: number;
  hasMemoryLog: boolean;
  hasMeetingHistory: boolean;
  compatibilityScore: number;
  sleepMode?: boolean;
  breakupRecovery?: boolean;
  safetyFlag?: boolean;
  blocked?: boolean;
  stalkerRisk?: boolean;
  secondChance: SecondChanceData;
}

/**
 * Validation functions
 */
export const SecondChanceValidation = {
  /**
   * Check if enough time has passed since last trigger (30 days minimum)
   */
  canTriggerAgain(lastTriggered: Timestamp | null): boolean {
    if (!lastTriggered) return true;
    const daysSince = (Date.now() - lastTriggered.toMillis()) / (1000 * 60 * 60 * 24);
    return daysSince >= 30;
  },

  /**
   * Check if match meets safety requirements
   */
  isSafe(criteria: MatchEligibilityCriteria): boolean {
    return !criteria.hasSafetyFlags &&
           !criteria.sleepModeActive &&
           !criteria.breakupRecoveryActive &&
           !criteria.isBlocked &&
           !criteria.stalkerRisk &&
           criteria.ageGap <= criteria.maxAgeGap;
  },

  /**
   * Determine eligibility based on time threshold and criteria
   */
  determineEligibility(criteria: MatchEligibilityCriteria): {
    eligible: boolean;
    reason: SecondChanceReason | null;
  } {
    const days = criteria.daysSinceLastInteraction;

    // Safety checks first
    if (!this.isSafe(criteria)) {
      return { eligible: false, reason: null };
    }

    // 7 days: >50 paid words OR >1 call
    if (days >= 7 && (criteria.totalPaidWords > 50 || criteria.callCount > 1)) {
      return { eligible: true, reason: 'pastMomentum' };
    }

    // 14 days: has Memory Log
    if (days >= 14 && criteria.hasMemoryLog) {
      return { eligible: true, reason: 'memory' };
    }

    // 21 days: has meeting history
    if (days >= 21 && criteria.hasMeetingHistory) {
      return { eligible: true, reason: 'meetingHistory' };
    }

    // 45 days: >400 paid words
    if (days >= 45 && criteria.totalPaidWords > 400) {
      return { eligible: true, reason: 'sentiment' };
    }

    // 60 days: strong compatibility score (>70)
    if (days >= 60 && criteria.compatibilityScore > 70) {
      return { eligible: true, reason: 'highCompatibility' };
    }

    return { eligible: false, reason: null };
  }
};