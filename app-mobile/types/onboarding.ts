/**
 * PACK 206C — First-Action Onboarding Missions Types
 * Types for the onboarding mission system
 */

// ============================================================================
// MISSION TYPES
// ============================================================================

export interface OnboardingMission {
  id: string;
  titleKey: string;
  descKey: string;
  rewardType: 'none'; // NO REWARDS OR TOKENS per PACK 206C rules
  completed: boolean;
}

export interface OnboardingMissionStep {
  id: string;
  textKey: string;
  completed: boolean;
  condition: OnboardingStepCondition;
}

export type OnboardingStepCondition =
  | { type: 'photos_uploaded'; count: number }
  | { type: 'bio_length'; minLength: number }
  | { type: 'attraction_choices'; count: number }
  | { type: 'likes_sent'; count: number }
  | { type: 'reply_sent' }
  | { type: 'first_message_sent' }
  | { type: 'chat_started' }
  | { type: 'stories_watched'; count: number }
  | { type: 'availability_added' }
  | { type: 'event_saved' };

// ============================================================================
// DAY-SPECIFIC MISSION TYPES
// ============================================================================

export interface Day1Mission {
  id: 'day1_magnetic_profile';
  titleKey: 'onboarding.day1.title';
  steps: OnboardingMissionStep[];
  completed: boolean;
}

export interface Day2Mission {
  id: 'day2_start_spark';
  titleKey: 'onboarding.day2.title';
  steps: OnboardingMissionStep[];
  completed: boolean;
}

export interface Day3Mission {
  id: 'day3_heat_connection';
  titleKey: 'onboarding.day3.title';
  steps: OnboardingMissionStep[];
  completed: boolean;
}

// ============================================================================
// ONBOARDING STATE
// ============================================================================

export interface OnboardingState {
  currentDay: 1 | 2 | 3 | 'completed';
  day1: Day1Mission;
  day2: Day2Mission;
  day3: Day3Mission;
  startedAt: Date;
  completedAt?: Date;
}

// ============================================================================
// PROGRESS TRACKING
// ============================================================================

export interface OnboardingProgress {
  userId: string;
  currentDay: 1 | 2 | 3 | 'completed';
  day1Completed: boolean;
  day2Completed: boolean;
  day3Completed: boolean;
  photosUploaded: number;
  bioCompleted: boolean;
  attractionChoicesSelected: boolean;
  likesSent: number;
  replySent: boolean;
  firstMessageSent: boolean;
  chatStarted: boolean;
  storiesWatched: number;
  availabilityAdded: boolean;
  eventSaved: boolean;
  completedAt?: Date;
  lastUpdated: Date;
}

// ============================================================================
// ANALYTICS EVENTS
// ============================================================================

export type OnboardingAnalyticsEvent =
  | 'onboarding.photoUpload.completed'
  | 'onboarding.vibe.completed'
  | 'onboarding.attractionPreferences.completed'
  | 'onboarding.like.sent'
  | 'onboarding.reply.sent'
  | 'onboarding.firstMessage.sent'
  | 'onboarding.chat.started'
  | 'onboarding.stories.watched'
  | 'onboarding.calendar.added'
  | 'onboarding.event.saved'
  | 'onboarding.day1.completed'
  | 'onboarding.day2.completed'
  | 'onboarding.day3.completed'
  | 'onboarding.finished';

export interface OnboardingAnalyticsPayload {
  userId: string;
  event: OnboardingAnalyticsEvent;
  timestamp: Date;
  metadata?: Record<string, any>;
}