/**
 * PACK 301 - Growth & Retention Engine
 * TypeScript type definitions for user retention, onboarding, and engagement
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// ONBOARDING STAGES
// ============================================================================

export enum OnboardingStage {
  NEW = 0,
  PHOTOS_ADDED = 1,
  PREFERENCES_SET = 2,
  DISCOVERY_VISITED = 3,
  SWIPE_USED = 4,
  CHAT_STARTED = 5,
  SAFETY_ENABLED = 6,
}

// ============================================================================
// USER SEGMENTS
// ============================================================================

export type UserSegment = 
  | 'NEW'           // Just registered
  | 'ACTIVE'        // Active < 3 days
  | 'DORMANT'       // 3-7 days inactive
  | 'CHURN_RISK'    // 7-30 days inactive
  | 'CHURNED'       // 30+ days inactive
  | 'RETURNING';    // Came back after churn

// ============================================================================
// NUDGE TRIGGERS
// ============================================================================

export type NudgeTrigger =
  | 'NO_PHOTOS_24H'
  | 'NO_SWIPE_48H'
  | 'NO_CHAT_3D'
  | 'NO_DISCOVERY_48H'
  | 'POTENTIAL_MATCH_NEARBY'
  | 'NEW_PROFILES_IN_AREA'
  | 'YOU_MISSED_X_LIKES'
  | 'ACTIVATE_PASSPORT'
  | 'ENABLE_NOTIFICATIONS';

// ============================================================================
// USER RETENTION PROFILE
// ============================================================================

export interface UserRetentionProfile {
  uid: string;
  
  // Onboarding progress
  onboardingStage: OnboardingStage;
  onboardingCompleted: boolean;
  
  // Activity tracking
  lastActiveAt: Timestamp;
  lastSwipeAt: Timestamp | null;
  lastChatAt: Timestamp | null;
  lastPurchaseAt: Timestamp | null;
  
  // Engagement metrics
  daysActive7: number;   // Active days in past 7 days
  daysActive30: number;  // Active days in past 30 days
  
  // Churn prediction
  riskOfChurn: number;   // 0-1 heuristic score
  segment: UserSegment;
  
  // Win-back tracking
  winBackSequenceStarted: boolean;
  winBackSequenceStep: number;      // 0-3 (which message sent)
  winBackSequenceLastSent: Timestamp | null;
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// RETENTION NOTIFICATION TYPES
// ============================================================================

export type RetentionNotificationType =
  | 'RETENTION_NUDGE'
  | 'REENGAGEMENT'
  | 'WINBACK';

// ============================================================================
// NUDGE TEMPLATE
// ============================================================================

export interface NudgeTemplate {
  trigger: NudgeTrigger;
  titleEn: string;
  bodyEn: string;
  titlePl: string;
  bodyPl: string;
  priority: 'LOW' | 'NORMAL';
  minHoursSinceLastNudge: number;
}

// ============================================================================
// RETENTION EVENT
// ============================================================================

export interface RetentionEvent {
  eventId: string;
  userId: string;
  eventType: 
    | 'SEGMENT_CHANGE' 
    | 'NUDGE_SENT' 
    | 'WINBACK_SENT' 
    | 'ONBOARDING_STEP' 
    | 'CHURN_SCORE_UPDATE'
    | 'RETENTION_SEGMENT_CHANGED'
    | 'RETENTION_NUDGE_SENT'
    | 'RETENTION_WINBACK_STARTED'
    | 'RETENTION_WINBACK_RETURNED'
    | 'RETENTION_ONBOARDING_COMPLETED'
    | 'RETENTION_CHURN_RISK_HIGH';
  oldValue?: any;
  newValue?: any;
  segment: UserSegment;
  churnScore: number;
  timestamp: Timestamp;
}


// ============================================================================
// RETENTION METRICS (for analytics)
// ============================================================================

export interface RetentionMetrics {
  date: string; // YYYY-MM-DD
  
  // Cohort metrics
  newUsers: number;
  day1Retention: number;   // % of users active next day
  day7Retention: number;   // % of users active after 7 days
  day30Retention: number;  // % of users active after 30 days
  
  // Segment distribution
  segmentNew: number;
  segmentActive: number;
  segmentDormant: number;
  segmentChurnRisk: number;
  segmentChurned: number;
  segmentReturning: number;
  
  // Onboarding metrics
  onboardingStarted: number;
  onboardingCompleted: number;
  avgOnboardingTimeMinutes: number;
  
  // Win-back effectiveness
  winBackSent: number;
  winBackReturned: number;
  winBackReturnRate: number;
  
  createdAt: Timestamp;
}

// ============================================================================
// CHURN RISK FACTORS
// ============================================================================

export interface ChurnRiskFactors {
  noChatsIn5Days: boolean;       // +0.15
  noSwipesIn72h: boolean;        // +0.10
  noAppOpenRecent: boolean;      // +0.20
  profileNotUpdated30d: boolean; // +0.05
  noLikesIn72h: boolean;         // +0.10
  noPhotosAdded: boolean;        // +0.15
  incompleteProfile: boolean;    // +0.10
}

// ============================================================================
// WIN-BACK MESSAGE TEMPLATES
// ============================================================================

export interface WinBackMessage {
  step: number; // 1, 2, or 3
  dayOffset: number; // Days after entering churned state
  titleEn: string;
  bodyEn: string;
  titlePl: string;
  bodyPl: string;
  priority: 'NORMAL' | 'HIGH';
}

// ============================================================================
// AUDIT LOG INTEGRATION (PACK 296)
// ============================================================================

export interface RetentionAuditEvent {
  eventType: 
    | 'RETENTION_SEGMENT_CHANGED'
    | 'RETENTION_NUDGE_SENT'
    | 'RETENTION_WINBACK_STARTED'
    | 'RETENTION_WINBACK_RETURNED'
    | 'RETENTION_ONBOARDING_COMPLETED'
    | 'RETENTION_CHURN_RISK_HIGH';
  
  userId: string;
  metadata: {
    segment?: UserSegment;
    oldSegment?: UserSegment;
    churnScore?: number;
    nudgeTrigger?: NudgeTrigger;
    winBackStep?: number;
    onboardingStage?: OnboardingStage;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const RETENTION_CONSTANTS = {
  // Segment thresholds (days inactive)
  ACTIVE_THRESHOLD: 3,
  DORMANT_THRESHOLD: 7,
  CHURN_RISK_THRESHOLD: 30,
  
  // Churn score threshold for early intervention
  HIGH_CHURN_RISK_THRESHOLD: 0.6,
  
  // Max retention pushes per user per day
  MAX_RETENTION_PUSH_PER_DAY: 1,
  
  // Win-back timing
  WINBACK_DAY_1: 1,
  WINBACK_DAY_4: 4,
  WINBACK_DAY_7: 7,
  
  // Onboarding completion criteria
  ONBOARDING_COMPLETE_STAGE: OnboardingStage.CHAT_STARTED,
} as const;

// ============================================================================
// NOTIFICATION TEMPLATES
// ============================================================================

export const NUDGE_TEMPLATES: Record<NudgeTrigger, NudgeTemplate> = {
  NO_PHOTOS_24H: {
    trigger: 'NO_PHOTOS_24H',
    titleEn: 'Add your photos',
    bodyEn: 'Complete your profile by adding photos. Profiles with photos get 10x more matches!',
    titlePl: 'Dodaj swoje zdjęcia',
    bodyPl: 'Uzupełnij swój profil dodając zdjęcia. Profile ze zdjęciami dostają 10x więcej dopasowań!',
    priority: 'NORMAL',
    minHoursSinceLastNudge: 24,
  },
  NO_SWIPE_48H: {
    trigger: 'NO_SWIPE_48H',
    titleEn: 'New profiles are waiting',
    bodyEn: 'Check out new people in your area. Start swiping!',
    titlePl: 'Nowe profile czekają',
    bodyPl: 'Zobacz nowe osoby w Twojej okolicy. Zacznij przesuwać!',
    priority: 'LOW',
    minHoursSinceLastNudge: 48,
  },
  NO_CHAT_3D: {
    trigger: 'NO_CHAT_3D',
    titleEn: 'Someone wants to chat',
    bodyEn: 'You have unread messages. Don\'t miss your chance to connect!',
    titlePl: 'Ktoś chce z Tobą porozmawiać',
    bodyPl: 'Masz nieprzeczytane wiadomości. Nie przegap szansy na połączenie!',
    priority: 'NORMAL',
    minHoursSinceLastNudge: 72,
  },
  NO_DISCOVERY_48H: {
    trigger: 'NO_DISCOVERY_48H',
    titleEn: 'Explore new connections',
    bodyEn: 'Visit Discovery to find people who match your interests.',
    titlePl: 'Odkrywaj nowe znajomości',
    bodyPl: 'Odwiedź Odkrywanie, aby znaleźć osoby pasujące do Twoich zainteresowań.',
    priority: 'LOW',
    minHoursSinceLastNudge: 48,
  },
  POTENTIAL_MATCH_NEARBY: {
    trigger: 'POTENTIAL_MATCH_NEARBY',
    titleEn: 'Potential match nearby',
    bodyEn: 'Someone perfect for you is nearby. Check them out!',
    titlePl: 'Potencjalne dopasowanie w pobliżu',
    bodyPl: 'Ktoś idealny dla Ciebie jest w pobliżu. Sprawdź!',
    priority: 'NORMAL',
    minHoursSinceLastNudge: 24,
  },
  NEW_PROFILES_IN_AREA: {
    trigger: 'NEW_PROFILES_IN_AREA',
    titleEn: 'New profiles appeared',
    bodyEn: 'New profiles appeared in your area. Take a look!',
    titlePl: 'Pojawiły się nowe profile',
    bodyPl: 'Pojawiły się nowe profile w Twojej okolicy. Zobacz!',
    priority: 'LOW',
    minHoursSinceLastNudge: 48,
  },
  YOU_MISSED_X_LIKES: {
    trigger: 'YOU_MISSED_X_LIKES',
    titleEn: 'You have new likes',
    bodyEn: 'You still have unread likes. Come back to check them.',
    titlePl: 'Masz nowe polubienia',
    bodyPl: 'Masz polubienia, których nie widziałeś. Sprawdź je!',
    priority: 'NORMAL',
    minHoursSinceLastNudge: 48,
  },
  ACTIVATE_PASSPORT: {
    trigger: 'ACTIVATE_PASSPORT',
    titleEn: 'Travel coming up?',
    bodyEn: 'Activate Passport mode to meet people in your destination.',
    titlePl: 'Planujesz podróż?',
    bodyPl: 'Aktywuj tryb Paszport, aby poznać ludzi w miejscu docelowym.',
    priority: 'LOW',
    minHoursSinceLastNudge: 168, // 7 days
  },
  ENABLE_NOTIFICATIONS: {
    trigger: 'ENABLE_NOTIFICATIONS',
    titleEn: 'Enable notifications',
    bodyEn: 'Turn on notifications so you never miss a match or message.',
    titlePl: 'Włącz powiadomienia',
    bodyPl: 'Włącz powiadomienia, abyś nigdy nie przegapił dopasowania lub wiadomości.',
    priority: 'LOW',
    minHoursSinceLastNudge: 72,
  },
};

export const WIN_BACK_MESSAGES: WinBackMessage[] = [
  {
    step: 1,
    dayOffset: 1,
    titleEn: 'We saved your spot',
    bodyEn: 'We saved your spot. Come back and meet new people.',
    titlePl: 'Zapisaliśmy Twoje miejsce',
    bodyPl: 'Zapisaliśmy Twoje miejsce. Wróć i poznaj nowych ludzi.',
    priority: 'NORMAL',
  },
  {
    step: 2,
    dayOffset: 4,
    titleEn: 'Swipe refreshed',
    bodyEn: 'Swipe refreshed. New profiles added today.',
    titlePl: 'Przesuwanie odświeżone',
    bodyPl: 'Przesuwanie odświeżone. Nowe profile dodane dzisiaj.',
    priority: 'NORMAL',
  },
  {
    step: 3,
    dayOffset: 7,
    titleEn: 'Your account is waiting',
    bodyEn: 'Your account is waiting. People from your city checked your profile.',
    titlePl: 'Twoje konto czeka',
    bodyPl: 'Twoje konto czeka. Osoby z Twojego miasta sprawdziły Twój profil.',
    priority: 'HIGH',
  },
];